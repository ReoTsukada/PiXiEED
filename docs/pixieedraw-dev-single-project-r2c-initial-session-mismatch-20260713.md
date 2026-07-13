# PiXiEEDrawDEV R2-C 起動直後 active-project-session mismatch 調査・最小修正

## 対象と実測

- 対象は `PiXiEEDrawDEV/` のみ。本番 `pixiedraw/`、V2 schema、autosave writer、recovery DB、U3、R4には変更を加えていない。
- ユーザー実ブラウザの build `20260713-040` では、`initial-project-session`、`document-reset-clean`、`reset-project-session`、`persistence-state-update:tab-mirror` で `[pixiedraw-dev:active-project-session-mismatch]` が発生した。
- 当該ログでは `sessionProjectId`、`autosaveProjectId`、`activeTabProjectId` は一致していた。従って project ID 自体の不一致ではない。

## 修正前に assert が `ok: false` にした全条件

修正前の `assertActiveProjectIdentityConsistency()` は、identity以外も含む `compareActiveProjectSessionWithTab()` の結果を混在させていた。

| 区分 | 比較 field / 条件 |
| --- | --- |
| session validation | `missing-project-id`、`missing-source-kind`、`missing-save-handle-state`、`bound-handle-missing`、`missing-autosave-identity`、`missing-recovery-identity` |
| tab / metadata | tab 不在、`projectId`、`sourceKind`、`sourceAdapterId`、`sourceProjectToken`、`lastSavedAdapterId`、`projectSaveHandleState`、handle本体参照、`projectSaveHandleMeta.fileName`、`projectSaveHandleMeta.adapterId` |
| identity | session `projectId` と `autosaveProjectId`、および session `projectId` と、誤って `tab.projectId` から組み立てた `runtimeProjectId` |

このため警告名は identity mismatch でも、実際には save binding metadata の差でも `ok: false` になっていた。

## 修正前の正規化後値

起動時の `new / initial` 経路で、ID以外に比較されていた値は次の扱いだった。`local-...` は実ブラウザごとに異なるため値そのものではなく正規化結果を記す。

| field | session側 | tab側 / autosave側 | 判定 |
| --- | --- | --- | --- |
| `projectId` | `local-...` | autosave / active tab と同じ `local-...` | 一致 |
| `runtimeProjectId` | project ID authority は存在しない | canvas document ID / legacy runtime ID は別概念 | 修正後は比較しない |
| `documentId` | active canvas document ID または空文字 | tabに同等fieldなし | session診断値のみ |
| `sourceKind` | tabから正規化した `unknown` 等 | 同じ normalizer | 一致 |
| `sourceAdapterId` | `null` | `sourceStorageAdapterId` を同じ normalizerで `null` | 一致 |
| `lastSavedAdapterId` | `null` | `lastSavedStorageAdapterId` を同じ normalizerで `null` | 一致 |
| `projectSaveHandleState` | `none` | `none` | 一致 |
| `hasProjectSaveHandle` | `false` | `false` | 一致 |
| `projectSaveHandleMeta` | state `none` のため `null` | 既定filenameを含むobject | **不一致の原因** |
| `autosaveIdentity` / `recoveryIdentity` | `projectId` を文字列として保持 | tabに同等fieldなし | session validationのみ |
| `dirty` / `unsaved` | 初期状態は `false` | 初期状態は `false` | 修正後は同時同期して比較 |

`null` と既定filename object の差だけが、ID一致にもかかわらず旧assertを `ok: false` にしていた。`null` / `undefined`、空文字 / `null`、adapter未設定 / legacy default は既存normalizerを通す。handle本体は比較・ログ出力せず、booleanと安全なmetadataだけを比較する。

## 実際に不一致だった field と各 phase の理由

根本原因は `projectSaveHandleMeta.fileName` である。保存先未設定時にも互換tab側の `normalizeProjectSaveHandleMeta(null)` が既定の document filename を含む metadata object を生成する。一方、active session は `projectSaveHandleState: 'none'` のとき metadata を意図どおり `null` に正規化する。

| phase | session | tab | 結果 |
| --- | --- | --- | --- |
| `initial-project-session` | state `none`、metadata `null` | state `none`、既定 filename metadata | metadata filename mismatch |
| `document-reset-clean` | dirty 更新後も state `none`、metadata `null` | 同上の既定 filename metadata | 同じ mismatch を再検出 |
| `reset-project-session` | 新sessionで state `none`、metadata `null` | 新tabでも既定 filename metadata | 同じ mismatch を再検出 |
| `persistence-state-update:tab-mirror` | session-first 更新後も state `none`、metadata `null` | mirror後も既定 filename metadata | 同じ mismatch を再検出 |

これは初期化順序そのものの破綻ではなく、`none` と「未boundなのに残る互換metadata」の normalize 差である。既存の session-first → tab-mirror 順序は維持する。

## R2-C の責務分離

- `assertActiveProjectIdentityConsistency()` は project identity のみを比較する。比較対象は session / autosave / active-tab の project ID だけである。
- `runtimeProjectId` は `null` として診断に残す。canvas document ID と legacy `tab.runtimeProjectId` は runtime object の識別子であり、project ID authority ではないため比較しない。`runtimeDocumentId` は参考値として別出力する。
- `validateActiveProjectSession()` は session単体の必須値 / schema検証だけを行う。
- `compareActiveProjectSessionWithTab()` は source、adapter、token、save binding、metadata、dirty mirror を比較する。project ID は含めない。
- 2つのDEV helperは validation・identity・metadataを合算した同じ top-level `ok` と field単位 `mismatches` を返す。helperだけ `ok: true`、assertだけ `ok: false` になる状態を作らない。

## 最小修正

1. `projectSaveHandleState === 'none'` の場合、session / tab とも save-handle metadata を比較対象外にした。未保存の既定filenameは保存 binding ではないためである。
2. `dirty` と tab の `unsaved` を比較し、描画・Undo / Redo・resetで session更新後に active tabも同じ値へ同期する。canvas / payload / writerは触らない。
3. identity mismatch と metadata mismatch を別ログにし、巨大payloadや FileSystemHandle 本体を出力しない。

各 mismatch は次の形で field単位に出力する。

```js
{
  field: 'projectSaveHandleMeta.fileName',
  sessionValue: null,
  tabValue: 'untitled.pixieedraw'
}
```

identityログには必ず `ok`、`phase`、`mismatches`、`sessionProjectId`、`autosaveProjectId`、`activeTabProjectId`、`runtimeProjectId`（null）、`runtimeDocumentId` を含める。

## 修正ファイル

- `PiXiEEDrawDEV/assets/js/active-project-session-utils.js`
- `PiXiEEDrawDEV/assets/js/app.js`
- `PiXiEEDrawDEV/assets/js/modules/open-project-tab-lifecycle.js`
- `scripts/test-pixiedraw-dev-active-project-session-r2.mjs`
- `PiXiEEDrawDEV/assets/js/build-info.js`
- `PiXiEEDrawDEV/version.json`
- `PiXiEEDrawDEV/index.html`

## 検証結果

- build: `20260713-041`（session module / app queryも更新）
- `node --check`（app、session utils、lifecycle）: PASS
- `node scripts/test-pixiedraw-dev-active-project-session-r2.mjs`: PASS。unbound session と既定filename metadataを持つ互換tabが一致扱いになる回帰ケースを追加。
- `node scripts/check-pixiedraw-dev-tdz.mjs`: PASS
- `git diff --check`: PASS
- 実ブラウザ: このCodex実行環境では未接続のため、修正後の mismatch 件数は未測定。

## 実ブラウザ再確認の合格条件

build `20260713-041` を読み込んだ後、起動直後と新規プロジェクト作成後に次を実行する。

```js
window.__pixieedrawValidateActiveProjectSession()
window.__pixieedrawCompareActiveProjectSessionWithTab()
window.__pixieedrawGetActiveProjectSession()
```

- `initial-project-session`、`document-reset-clean`、`reset-project-session`、`persistence-state-update:tab-mirror` の mismatch は各 0。
- Console に `[pixiedraw-dev:active-project-session-mismatch]` と `[pixiedraw-dev:active-project-session-metadata-mismatch]` が出ない。
- helperはいずれも top-level `ok: true`。

この条件が実ブラウザで確認できれば、R2-BのV2保存・recent・recovery検証を再開できる。R4はまだ開始しない。
