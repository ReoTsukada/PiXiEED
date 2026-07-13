# PiXiEEDrawDEV 単一プロジェクト化 Phase R2

## activeProjectSession 契約・保存責務移管準備

- 対象: `PiXiEEDrawDEV/` のみ
- 基準ビルド: `20260713-040`
- 本番 `pixiedraw/`: 未変更
- R1設計根拠: `docs/pixieedraw-dev-single-project-r1-audit-20260713.md`

## 1. 実装概要

R2ではtab、V2 schema、autosave writerを削除・変更していない。`app.js` 内に一つだけ `activeProjectSession` を追加し、active tabに混在していたproject identityと保存metadataを二重保持する。

編集データ（document snapshot、pixel、canvas、frame、layer、history）はsessionに複製しない。既存 `state` が唯一の編集authorityのままである。

新規pure module:

- `PiXiEEDrawDEV/assets/js/active-project-session-utils.js`

新規test:

- `scripts/test-pixiedraw-dev-active-project-session-r2.mjs`

## 2. session schema

```js
{
  projectId,
  documentId,
  sourceKind,
  sourceAdapterId,
  canonicalPayloadFormat,
  canonicalSchemaVersion,
  sourceProjectToken,
  lastSavedAdapterId,
  projectSaveHandle,
  projectSaveHandleMeta,
  projectSaveHandleState,
  autosaveIdentity,
  recoveryIdentity,
  dirty,
  openedAt,
  updatedAt
}
```

`sourceAdapterId` は既存の `sourceStorageAdapterId`、`lastSavedAdapterId` は既存の `lastSavedStorageAdapterId` をsession上で読みやすくした名称であり、新しいadapter IDやschema値は作っていない。

`autosaveIdentity` と `recoveryIdentity` は現在のproject IDを参照するmetadataであり、IndexedDB manifest/checkpoint/journalの保存形式は変えていない。

## 3. session authority範囲

sessionが所有するもの:

- project/autosave/recovery identity
- source/adapter/canonical metadata
- File System Access save handle、meta、state
- dirtyのmirror

sessionが所有しないもの:

- document payload
- canvas/frame/layer/palette/pixel data
- history/timelapse payload
- V2 `sheets`, `sheetOrder`, `activeSheetId`
- autosave timer、writer、DB record

## 4. tab fallback範囲

読み取り順は次のとおりである。

1. 有効な `activeProjectSession`
2. active tab
3. 既存legacy runtime state

対象getter:

- `getActiveProjectPersistenceState()`
- `getActiveProjectSaveBinding()`

sessionが存在しているのに不正な場合はDEV warningを出してtab fallbackする。無言で切り替わらないため、移行中の整合性欠落を検出できる。

## 5. lifecycle

`open-project-tab-lifecycle.js` の次のruntime commit後にsessionをreplaceする。

- 初期project tab生成
- `appendOpenProjectTabFromCurrentState()` でactive化したproject
- `replaceActiveOpenProjectTabFromCurrentState()`
- `resetOpenProjectTabsToCurrentProject()`

これにより、新規作成、V1/V2/画像/GIF読込、recent、recovery、reload restoreが既存のruntime commitとtab互換反映を完了した地点でsessionを更新する。decode/validation/candidate生成中にはsessionを更新しない。

project replacement前のautosave flush失敗時は既存どおりruntime commit自体が行われないため、旧sessionも保持される。

## 6. persistence getter変更

`getActiveProjectPersistenceState()` はsessionから次を返す。

```js
{
  sourceKind,
  sourceStorageAdapterId,
  sourceProjectToken,
  lastSavedStorageAdapterId,
  projectSaveHandleState
}
```

既存save planの入力形を変えていないため、以下の既存規則は変更していない。

- bound V2 handleへのsame-handle overwrite
- V1 -> V2で新規保存を強制
- V2 -> V1で新規保存を強制
- recent/recovery/autosave restoreをexternal handle bound扱いしない

## 7. handle二重書き

active tabのhandle操作は次の順で行う。

1. sessionを更新
2. active tabを更新
3. project ID/source/adapter/handle/metaを比較
4. 既存UI/renderを実行

対象:

- bind
- clear
- unavailable
- permission/meta/adapter更新

FileSystemHandleはJSON stringifyせず、sessionとtabの参照同一性で比較する。比較対象のmetaは `fileName` と `adapterId` である。

## 8. project ID整合性

`assertActiveProjectIdentityConsistency()` がDEVで次を比較する。

```text
activeProjectSession.projectId
autosaveProjectId
active tab.projectId
runtime project identity
```

不一致時はphase、各project ID、source kind/adapter、mismatch一覧をconsole errorへ出す。一時的にsession先行更新するhandle二重書き中だけ `allowTransientMismatch: true` を明示し、tab mirror後に必ず通常比較する。

## 9. dirty同期

dirty authorityは変更していない。

- authority: `hasDocumentUnsavedChanges()`（`unsavedChangeToken` / `durableSaveToken`）
- session: mirror field

次の既存境界でsession mirrorを同期する。

- `markDocumentUnsavedChange()`
- `markDocumentDurablySaved()`
- `resetDocumentUnsavedChanges()`

各mutationへ新しいhookは追加していない。

## 10. autosave / recovery 非変更確認

変更していないもの:

- IndexedDB schema
- V2 manifest/checkpoint/journal/current reference
- autosave debounce/writer/retention
- recovery record/U3 checkpoint/digest/compression
- V1/V2 storage adapter
- reload snapshot形式

sessionはwriterの引数や保存payloadを変えず、既存metadataを参照するだけである。

## 11. V2 sheets 非変更確認

変更していないもの:

- `sheets`
- `sheetOrder`
- `activeSheetId`
- `buildProjectSheetsPayload()`
- 旧複数sheet readerと分割移行処理

R2ではactive sessionのproject IDとactive tabのproject IDを比較する。V2 sheet IDは既存tab IDのまま維持する。

## 12. DEV helper

巨大payloadやFileSystemHandle本体を返さないhelperを追加した。

```js
window.__pixieedrawGetActiveProjectSession()
window.__pixieedrawValidateActiveProjectSession()
window.__pixieedrawCompareActiveProjectSessionWithTab()
```

返却値にはproject ID、source metadata、handle有無、handle meta、dirty、identity、mismatchesだけを含める。

## 13. test結果

実行済み:

- `node --check PiXiEEDrawDEV/assets/js/app.js`
- `node --check PiXiEEDrawDEV/assets/js/active-project-session-utils.js`
- `node --check PiXiEEDrawDEV/assets/js/modules/open-project-tab-model.js`
- `node --check PiXiEEDrawDEV/assets/js/modules/open-project-tab-lifecycle.js`
- `node scripts/test-pixiedraw-dev-active-project-session-r2.mjs`
- `node scripts/check-pixiedraw-dev-tdz.mjs`
- `git diff --check -- PiXiEEDrawDEV scripts/test-pixiedraw-dev-active-project-session-r2.mjs`

pure module testの確認範囲:

1. 空入力とinvalid session
2. project ID/source/adapter/handle state/meta正規化
3. updateで未指定field保持
4. replaceで旧handle/adapterを持ち越さないこと
5. bind/clear/unavailable
6. session/tab一致と不一致列挙
7. script load順
8. session-first / tab-mirror静的結線

## 14. 実ブラウザ結果

未実施。この実行環境ではブラウザ操作接続を利用できない。

次のDEV手動確認が必要である。

1. 新規project作成後、`__pixieedrawValidateActiveProjectSession()` が `ok: true`
2. V2保存後、handle stateが`bound`
3. 1ドット編集後の2回目V2保存でpickerが出ない
4. reload後もproject ID一致
5. V1読込後のV2保存でpickerが出る
6. recent/recovery復元後の通常保存でpickerが出る
7. `__pixieedrawCompareActiveProjectSessionWithTab()` が `ok: true`

## 15. 残存tab依存

残存しているもの:

- `openProjectTabs` / `activeOpenProjectTabId`
- tab IDをV2 sheet IDへ流用するwriter
- resident/deferred payload
- tab switch/add/remove/long press
- tab単位history/timelapse owner ID
- tab lifecycle内のhandle fallback

R2では意図的に残している。R4でsessionを唯一のmetadata authorityへ昇格した後、R9で削除する。

## 16. R3 / R4への引き継ぎ

R3はUIが既に非表示であることの回帰テスト化に留める。

R4では次を行う前提が整った。

1. sessionを唯一のpersistence metadata authorityにする
2. `openProjectTabs` を一要素互換adapterへ縮退する
3. stable document slot IDをtab IDから分離する計画を作る
4. V2 writerは一要素sheetを維持したままsessionから値を供給する

R4開始前に、上記手動browser確認とV1/V2/recovery/reloadの回帰確認を完了する必要がある。
